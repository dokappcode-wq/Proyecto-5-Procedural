import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import * as Layout from './ShipLayout.js';
import { BatteryBank } from './BatteryBank.js';
import { ShipFlight, FlightState } from './ShipFlight.js';
import { ShipModel } from './ShipModel.js';

/**
 * ShipSystem — la nave pequeña de MUNDO 0: una estructura en la que se entra.
 *
 *   Botón exterior (bajo la cola) → abre la compuerta inferior (rampa).
 *   Sala de estar / laboratorio → Mapa (Tecnología 2), Puesto de carga
 *     (Tecnología 3) y ranuras libres para tecnologías futuras.
 *   Puerta → sala de controles → asiento del piloto (Tecnología 1, vuelo).
 *
 * A los mandos: la cámara pasa a 3ª persona sobre la nave (CameraSystem.setVehicleView)
 * y el jugador queda sentado; W/S adelante/atrás, A/D girar, Espacio/C subir/bajar,
 * T despegar/aterrizar, G compuerta, L patas, E levantarse.
 * Levantarse en el aire: la nave se queda flotando (gasta batería) y se puede
 * recorrer; con la compuerta abierta se puede saltar. Si el jugador deja la nave
 * en el aire, la nave busca un sitio despejado y aterriza sola.
 * Reloj de la nave (en la mesa del laboratorio): al usarlo muestra dónde está la nave.
 * El panel de mandos (ShipPilotHUD) envía los mismos mandos por eventos.
 *
 * Reparto: ShipLayout (forma y colisiones), ShipFlight (vuelo), BatteryBank
 * (combustible), ShipModel (dibujo). Este sistema solo compone y habla por eventos.
 *
 * Consultas para otros sistemas (mismas firmas que ConstructionSystem):
 *   surfaceAt, blocksAt, ceilingAt, resolveCollisions, raycastDistance,
 *   getShelterAt (temperatura), getInteractablesNear / interact (interacción),
 *   overlapsBox (no construir encima de la nave).
 */
export class ShipSystem {
  constructor({ config, spaceConfig, scene, world, player, input, events, landingBlocked = () => null }) {
    this.name = 'ship';
    this._cfg = config;
    this._spaceCfg = spaceConfig; // ORBIT_MIN_ALTITUDE, ORBIT_COST
    this._world = world;
    this._player = player;
    this._input = input;
    this._events = events;

    this.ship = { x: 0, y: 0, z: 0, yaw: 0, hatch: 0, legs: 1, door: 0, legFeet: [0, 0, 0, 0], rampAngle: Layout.rampOpenAngle(0), pitch: 0, roll: 0 };
    this.batteries = new BatteryBank(config.BATTERIES);
    this.flight = new ShipFlight({
      config,
      ship: this.ship,
      batteries: this.batteries,
      terrain: {
        heightAt: (x, z) => world.getHeightAt(x, z),
        surfaceAt: (x, z) => {
          const h = world.getHeightAt(x, z);
          const pond = world.water.getPondAt?.(x, z);
          return Math.max(h, world.seaLevel, pond ? pond.level : -Infinity);
        },
        isWater: (x, z) => world.water.isWater(x, z) || world.getHeightAt(x, z) < world.seaLevel + 0.3,
        get bounds() {
          return world.getBounds();
        },
      },
      landingBlocked: (ship) => landingBlocked(ship),
    });
    this.flight.onEvent = (type, data) => this._onFlightEvent(type, data);
    this.model = new ShipModel({ scene });

    this.piloting = false;
    this.hasSpaceNode = false; // nodo espacial instalado (Etapa 3: la nave crece)
    this.body = 'MUNDO_0';   // cuerpo en el que está la nave (MUNDO 0, una luna o el espacio)
    this._activeBody = () => 'MUNDO_0';
    this._held = new Set();  // mandos mantenidos desde el panel (ratón)
    this._raycaster = new THREE.Raycaster();
    this._stateKey = '';
    this._telemetryTimer = 0;
    this._lastCharge = -1;
    this._seat = new THREE.Vector3();
    this._autoLandRetry = 0;

    // Vista de la cámara a los mandos: órbita alrededor de la nave.
    const self = this;
    this.view = {
      yawOffset: 0,
      basePitch: config.CAMERA_PITCH,
      // En el espacio la cámara sigue también el cabeceo de la nave.
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
    // Espacio (Fase 13): al subir, la nave asciende tras el fundido; en órbita se
    // queda congelada donde estaba y al volver sigue flotando en el mismo sitio.
    this.spaceMode = 'SURFACE';
    events.on(GameEvents.SPACE_STATE_CHANGED, ({ state }) => this._onSpaceState(state));
  }

  _onSpaceState(state) {
    // Durante los fundidos la nave queda congelada (al subir, asciende deprisa).
    this.spaceMode = state === 'ASCENDING' || state === 'DESCENDING' ? state : 'SURFACE';
  }

  /** Entra en el espacio: la nave pasa al origen del mundo "espacio" (se puede recorrer). */
  enterSpace(yaw) {
    const s = this.ship;
    this.body = 'SPACE';
    Object.assign(s, { x: 0, y: 0, z: 0, yaw, pitch: 0, roll: 0 });
    s.legFeet = [0, 0, 0, 0];
    this.flight.state = FlightState.SPACE;
    this.flight.hover();
    this.flight.state = FlightState.SPACE;
  }

  /** Mueve y orienta la nave según la navegación espacial. */
  syncSpace(yaw, pitch, thrust) {
    this.ship.yaw = yaw;
    this.ship.pitch = this.piloting ? pitch : 0;
    this._spaceThrust = thrust;
  }

  /** Llega a un cuerpo desde el espacio: flotando sobre su zona de aterrizaje. */
  arriveAt(bodyId, height) {
    const s = this.ship;
    const site = this._world.getLandingSite() ?? { x: 0, z: 0, yaw: 0 };
    this.body = bodyId;
    Object.assign(s, { x: site.x, z: site.z, yaw: site.yaw, pitch: 0, roll: 0 });
    s.y = this._world.getHeightAt(site.x, site.z) + height;
    s.legFeet = [0, 0, 0, 0];
    this.flight.state = FlightState.FLYING;
    this.flight.hover();
    this.model.update(s, 0, { airborne: true, batteries: this.batteries.snapshot().slots });
  }

  /** ¿Se puede salir al espacio ahora? @returns motivo o null */
  orbitBlocked() {
    if (!this.piloting) return 'Siéntate a los mandos';
    if (!this.hasSpaceNode) return 'Para salir al espacio hace falta el nodo espacial';
    if (this.flight.state !== FlightState.FLYING) return 'Despega primero';
    if (this.flight.hatchTarget > 0 || this.ship.hatch > 0.01) return 'Cierra la compuerta antes de salir al espacio';
    if (this.ship.y - this._world.getHeightAt(this.ship.x, this.ship.z) < this._spaceCfg.ORBIT_MIN_ALTITUDE) return `Sube por encima de ${this._spaceCfg.ORBIT_MIN_ALTITUDE} m para salir al espacio`;
    if (this.batteries.total < this._spaceCfg.ORBIT_COST) return 'No queda batería suficiente para salir de la atmósfera';
    return null;
  }

  /** Función que dice qué cuerpo está activo (WorldManager). */
  setBodyProvider(fn) {
    this._activeBody = fn;
  }

  /** ¿Está la nave en el cuerpo que se está mostrando? */
  get present() {
    return this.body === this._activeBody();
  }

  /** Inventario (baterías y reloj); se inyecta desde main. */
  setInventory(inventory) {
    this._inventory = inventory;
  }

  /** ¿Tiene el jugador el reloj de la nave? */
  get watchTaken() {
    return !!this._inventory?.hasItem(this._cfg.WATCH_ITEM, 1);
  }

  get state() {
    return this.flight.state;
  }

  // ---- Colocación -------------------------------------------------------------

  /** Nave aterrizada en el lugar de la seed, cerrada y con las baterías llenas. */
  resetToLandingSite() {
    this._forceExit(true);
    const site = this._world.getLandingSite();
    if (!site) return;
    this.body = 'MUNDO_0';
    this.placeLanded(site.x, site.z, site.yaw);
    this.batteries.fillAll(this._cfg.BATTERIES.START_CHARGE);
    this._emitBatteries(true);
  }

  /** Posa la nave en (x, z) con las patas adaptadas al terreno. */
  placeLanded(x, z, yaw) {
    const s = this.ship;
    Object.assign(s, { x, z, yaw, hatch: 0, legs: 1, door: 0, pitch: 0, roll: 0 });
    this.flight.hatchTarget = 0;
    this.flight.legsTarget = 1;
    this.flight.doorTarget = 0;
    this.flight.state = FlightState.LANDED;
    const feet = Layout.LEGS.map((l) => {
      const [wx, wz] = Layout.toWorld(s, l.x, l.z);
      return this._world.getHeightAt(wx, wz);
    });
    s.y = Math.max(...feet);
    s.legFeet = feet.map((h) => h - s.y);
    const [rx, rz] = Layout.toWorld(s, Layout.RAMP_FOOT_SAMPLE[0], Layout.RAMP_FOOT_SAMPLE[1]);
    s.rampAngle = Layout.rampOpenAngle(this._world.getHeightAt(rx, rz) - s.y);
    this.model.update(s, 0, { batteries: this.batteries.snapshot().slots });
  }

  // ---- Mandos -------------------------------------------------------------------

  command(cmd) {
    if (cmd === 'STAND_UP') return this.exitPilot();
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
    if (cmd === 'TAKEOFF_OR_LAND') cmd = this.flight.state === FlightState.LANDED ? 'TAKEOFF' : 'LAND';
    if (cmd === 'TOGGLE_LEGS') cmd = this.flight.legsTarget > 0 ? 'RETRACT_LEGS' : 'DEPLOY_LEGS';
    const r = this.flight.command(cmd);
    if (r.message) this._message(r.message, r.ok ? 'biome' : 'danger');
    return r.ok;
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
    const [x, z] = Layout.toWorld(s, Layout.SEAT.standUp[0], Layout.SEAT.standUp[1]);
    this._player.teleport(x, s.y + Layout.DIM.FLOOR, z);
    this._player.yaw = s.yaw;
    this._player.bodyYaw = s.yaw;
    this._player.pitch = 0;
    this._events.emit(GameEvents.SHIP_PILOT_CHANGED, { piloting: false });
    return true;
  }

  /** Salida forzosa (muerte, regenerar mundo): si vuela, aterriza sola. */
  _forceExit(silent = false) {
    if (!this.piloting) return;
    this.piloting = false;
    this._held.clear();
    if (this.flight.state !== FlightState.LANDED && this.flight.state !== FlightState.SPACE) this.flight.autoLand();
    this._events.emit(GameEvents.SHIP_PILOT_CHANGED, { piloting: false, silent });
  }

  // ---- Bucle ----------------------------------------------------------------------

  update(dt) {
    this.model.root.visible = this.present;
    if (!this.present) return; // la nave está en otro cuerpo
    if (this.spaceMode !== 'SURFACE') {
      // Saliendo de la atmósfera: sube deprisa (tras el fundido). En órbita: congelada.
      if (this.spaceMode === 'ASCENDING' && this._spaceY !== undefined) this.ship.y += 45 * dt;
      if (this.piloting) this._placePlayerInSeat();
      this.model.update(this.ship, dt, { airborne: true, thrust: 1, batteries: this.batteries.snapshot().slots });
      return;
    }
    let controls = null;
    if (this.piloting) controls = this._readPilotInput();
    this.flight.autopilot = !this.piloting;
    this.flight.update(dt, controls);
    if (this.piloting) this._placePlayerInSeat();
    else this._checkAbandoned(dt);
    this.model.watch.visible = !this.watchTaken;

    const snap = this.batteries.snapshot();
    const inSpace = this.flight.state === FlightState.SPACE;
    if (!this.piloting) this.spaceControls = null;
    this.model.update(this.ship, dt, {
      airborne: this.flight.airborne,
      thrust: inSpace ? this._spaceThrust ?? 0 : Math.min(1, Math.abs(this.flight.forwardSpeed) / this._cfg.MAX_SPEED),
      batteries: snap.slots,
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
      // Rumbo automático: 1 MUNDO 0 · 2 Luna A · 3 Luna B.
      ['MUNDO_0', 'MOON_A', 'MOON_B'].forEach((id, i) => {
        if (input.wasPressed(`HOTBAR_${i + 1}`)) this._events.emit(GameEvents.SPACE_AUTOPILOT, { target: id });
      });
    }
    if (input.wasPressed('INTERACT')) {
      input.consume('INTERACT'); // que la interacción no vuelva a sentarte con la misma pulsación
      this.exitPilot();
    }

    // Ratón: órbita de la cámara alrededor de la nave. Rueda: distancia.
    const m = input.getMouseDelta();
    const v = this.view;
    v.yawOffset -= m.x * 0.0025;
    v.pitch = Math.max(-1.25, Math.min(0.45, v.pitch - m.y * 0.0025));
    const wheel = input.getWheel();
    if (wheel) v.distance = Math.max(v.minDistance, Math.min(v.maxDistance, v.distance + wheel * 1.5));

    const axis = (pos, neg) => (pos ? 1 : 0) - (neg ? 1 : 0);
    const controls = {
      forward: axis(input.isDown('FORWARD') || held.has('FORWARD'), input.isDown('BACKWARD') || held.has('BACKWARD')),
      turn: axis(input.isDown('RIGHT') || held.has('RIGHT'), input.isDown('LEFT') || held.has('LEFT')),
      vertical: axis(input.isDown('JUMP') || held.has('UP'), input.isDown('DESCEND') || held.has('DOWN')),
      boost: input.isDown('RUN'),
    };
    // En el espacio los mandos los usa SpaceTravel (navegación en km).
    this.spaceControls = this.flight.state === FlightState.SPACE ? controls : null;
    return this.flight.state === FlightState.SPACE ? null : controls;
  }

  /** Punto dentro de la nave donde reaparecer (en el laboratorio). */
  getRespawnPoint() {
    const [x, z] = Layout.toWorld(this.ship, -1.6, 3.4);
    return { x, y: this.ship.y + Layout.DIM.FLOOR, z };
  }

  /** ¿Está el jugador dentro de la nave, en la rampa o en el tejado? */
  isAboard(position = this._player.position) {
    const s = this.ship;
    const [lx, lz] = Layout.toLocal(s, position.x, position.z);
    const lowest = Math.min(Layout.rampEnd(s).y, Layout.DIM.FLOOR);
    return Math.abs(lx) <= Layout.DIM.HALF_WIDTH + 0.4 && lz >= Layout.DIM.FRONT - 0.4 && lz <= Layout.DIM.REAR + 0.4 &&
      position.y >= s.y + lowest - 1.0;
  }

  /** Nave en el aire sin nadie dentro (el jugador ha saltado): aterriza sola. */
  _checkAbandoned(dt) {
    this._autoLandRetry = Math.max(0, this._autoLandRetry - dt);
    if (this.flight.state !== FlightState.FLYING || this._autoLandRetry > 0 || this.isAboard()) return;
    this._autoLandRetry = 3;
    if (this.flight.autoLand()) this._message('Has saltado de la nave: aterrizará sola en un sitio despejado.', 'biome');
  }

  _placePlayerInSeat() {
    const s = this.ship;
    const p = this._player;
    const [x, z] = Layout.toWorld(s, Layout.SEAT.x, Layout.SEAT.z);
    p.position.set(x, s.y + Layout.DIM.FLOOR + 0.3, z);
    p.velocity.set(0, 0, 0);
    p.state.onGround = true;
    p.state.isMoving = false;
    p.state.isRunning = false;
    p.yaw = s.yaw;
    p.bodyYaw = s.yaw;
  }

  _onFlightEvent(type, data) {
    const texts = {
      TAKEOFF: null,
      AIRBORNE: 'En el aire. [L] recoger patas · [T] aterrizar · [E] levantarse (se queda flotando)',
      LANDING: null,
      LANDED: 'Aterrizaje completado.',
      EMERGENCY: 'Batería agotada: aterrizaje de emergencia.',
    };
    if (type === 'NOTICE') this._message(data.message, 'danger');
    else if (texts[type]) this._message(texts[type], type === 'EMERGENCY' ? 'danger' : 'biome');
  }

  // ---- Interacción (E) -------------------------------------------------------------

  /**
   * Puntos interactivos cerca del jugador, en coordenadas del mundo:
   * [{ id, x, y, z, aimRadius, reach, label, action, key }]
   */
  getInteractablesNear(x, y, z, range) {
    if (this.piloting || !this.present) return [];
    const s = this.ship;
    if (Math.hypot(x - s.x, z - s.z) > range + 12) return [];
    const list = [];
    const add = (id, [lx, ly, lz], label, action, aimRadius = 0.5) => {
      const [wx, wz] = Layout.toWorld(s, lx, lz);
      const wy = s.y + ly;
      if (Math.abs(wy - (y + 1.2)) > 2.1) return; // otra planta (dentro/fuera)
      list.push({ id, x: wx, y: wy, z: wz, aimRadius, reach: 0.4, label, action, key: 'E' });
    };
    const hatchAction = this.flight.hatchTarget > 0 ? 'Cerrar compuerta' : 'Abrir compuerta';
    add('EXT_BUTTON', Layout.EXT_BUTTON.aim, 'Nave · botón de la compuerta', hatchAction, 0.4);
    add('INNER_BUTTON', Layout.INNER_BUTTON.aim, 'Botón de la compuerta', hatchAction, 0.4);
    add('DOOR', Layout.DOOR_AIM, 'Puerta de la sala de controles', this.flight.doorTarget > 0 ? 'Cerrar' : 'Abrir', 0.8);
    add('SEAT', Layout.SEAT.aim, 'Asiento del piloto', 'Sentarse a los mandos', 0.6);
    add('WATCH', Layout.WATCH_AIM, 'Reloj de la nave', this.watchTaken ? 'Dejar el reloj' : 'Coger el reloj', 0.35);
    for (const [slotId, slot] of Object.entries(Layout.SLOTS)) {
      const techId = this._cfg.INSTALLED[slotId] ?? null;
      const tech = techId ? this._cfg.TECHNOLOGIES[techId] : null;
      const action = techId === 'PLANET_MAP' ? 'Abrir mapa' : techId === 'CHARGING_STATION' ? 'Ver baterías' : 'Examinar';
      add(`SLOT:${slotId}`, slot.aim, tech ? `${tech.ICON} ${tech.NAME}` : 'Ranura de tecnología libre', action, 0.6);
    }
    return list;
  }

  interact(id) {
    if (id === 'EXT_BUTTON' || id === 'INNER_BUTTON') return this.command('TOGGLE_HATCH');
    if (id === 'DOOR') {
      this.flight.toggleDoor();
      return true;
    }
    if (id === 'SEAT') return this.enterPilot();
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
    if (id.startsWith('SLOT:')) {
      const techId = this._cfg.INSTALLED[id.slice(5)] ?? null;
      if (techId === 'PLANET_MAP') this._events.emit(GameEvents.SHIP_PANEL_REQUEST, { panel: 'MAP' });
      else if (techId === 'CHARGING_STATION') this._events.emit(GameEvents.SHIP_PANEL_REQUEST, { panel: 'CHARGER' });
      else if (techId === 'FLIGHT_SYSTEM') this._message('Sistema de vuelo: siéntate en el asiento del piloto para volar.');
      else this._message('Ranura libre: aquí se podrán instalar nuevas tecnologías.');
      return true;
    }
    return false;
  }

  // ---- Puesto de carga -----------------------------------------------------------

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

  // ---- Estado para la UI -------------------------------------------------------------

  getTelemetry() {
    const s = this.ship;
    const ground = this._world.getHeightAt(s.x, s.z);
    return {
      flight: this.flight.state,
      piloting: this.piloting,
      hatch: this.flight.hatchTarget > 0 ? 'OPEN' : 'CLOSED',
      hatchMoving: s.hatch > 0.001 && s.hatch < 0.999,
      legs: this.flight.legsTarget > 0 ? 'DEPLOYED' : 'RETRACTED',
      door: this.flight.doorTarget > 0 ? 'OPEN' : 'CLOSED',
      altitude: Math.max(0, s.y - ground),
      height: s.y,
      speed: Math.abs(this.flight.forwardSpeed),
      autopilot: !this.piloting && this.flight.airborne,
      aboard: this.isAboard(),
      vertical: this.flight.verticalSpeed,
      charge: this.batteries.ratio,
      canOrbit: this.piloting && !this.orbitBlocked(),
      position: { x: s.x, z: s.z, yaw: s.yaw },
    };
  }

  _emitState(dt) {
    const t = this.getTelemetry();
    const key = `${t.flight}|${t.piloting}|${t.hatch}|${t.legs}|${t.door}`;
    this._telemetryTimer -= dt;
    if (key === this._stateKey && this._telemetryTimer > 0) return;
    this._stateKey = key;
    this._telemetryTimer = 0.2;
    this._events.emit(GameEvents.SHIP_STATE_CHANGED, t);
  }

  _message(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }

  // ---- Consultas de colisión y entorno ----------------------------------------------

  surfaceAt(x, z, maxY) {
    return this.present ? Layout.surfaceAt(this.ship, x, z, maxY) : null;
  }

  blocksAt(x, z, r, y0, y1) {
    return this.present && Layout.blocksAt(this.ship, x, z, r, y0, y1);
  }

  ceilingAt(x, z, y) {
    return this.present ? Layout.ceilingAt(this.ship, x, z, y) : Infinity;
  }

  resolveCollisions(pos, r, y0, y1) {
    return this.present && Layout.resolveCollisions(this.ship, pos, r, y0, y1);
  }

  /** Oclusión de la cámara (no cuando la cámara orbita la propia nave). */
  raycastDistance(origin, dir, maxDist) {
    if (this.piloting || !this.present) return null;
    this._raycaster.set(origin, dir);
    this._raycaster.far = maxDist;
    const hit = this._raycaster.intersectObject(this.model.root, true)[0];
    return hit ? hit.distance : null;
  }

  /** Refugio para la temperatura: dentro y con la compuerta cerrada = climatizada. */
  getShelterAt(x, y, z) {
    if (!this.present || !Layout.isInside(this.ship, x, y, z)) return { factor: 0, heated: false };
    const closed = this.ship.hatch < 0.01;
    return { factor: closed ? 1 : 0.6, heated: closed };
  }

  /** ¿Choca una caja del mundo (AABB en planta) con la nave? (construcción) */
  overlapsBox(box, margin = 0.2) {
    return this.present && Layout.overlapsFootprint(this.ship, box, margin);
  }
}
