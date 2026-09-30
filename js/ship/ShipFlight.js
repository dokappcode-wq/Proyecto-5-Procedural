import { LEGS, DIM, LEG_RETRACTED_BOTTOM, GROUND_SAMPLES, RAMP_FOOT_SAMPLE, toWorld, rampOpenAngle } from './ShipLayout.js';

/**
 * ShipFlight — estado de vuelo de la nave (Tecnología 1: sistema de vuelo). Sin Three.js.
 *
 * Estados: LANDED → (despegar) TAKING_OFF → FLYING → (aterrizar) LANDING → LANDED.
 *
 * Mandos (`command`): TAKEOFF, LAND, TOGGLE_HATCH, RETRACT_LEGS, DEPLOY_LEGS.
 * Movimiento (`update(dt, controls)`): forward (−1..1), turn (−1..1),
 * vertical (−1..1), boost. Sin física realista: velocidades que se acercan a
 * un objetivo, como el controlador del jugador.
 *
 * Reglas:
 *   - Para despegar la compuerta debe estar cerrada y quedar batería.
 *   - La compuerta se puede abrir también en el aire (para saltar); las patas solo
 *     se recogen en el aire.
 *   - Sin piloto (`autopilot`) la nave se queda flotando en el sitio, gastando batería.
 *   - Aterrizaje automático (`autoLand`): busca un sitio despejado cercano, va hasta
 *     él y se posa (al saltar de la nave, al morir el piloto, sin batería...).
 *   - Para aterrizar hacen falta las patas fuera y un terreno seco y bastante llano,
 *     sin árboles ni construcciones debajo (`landingBlocked`).
 *   - Consume baterías mientras está en el aire; sin carga, aterrizaje de emergencia.
 *
 * `ship` es el estado compartido con el modelo y las consultas de colisión:
 *   { x, y, z, yaw, hatch, legs, door, legFeet[], rampAngle, pitch, roll }
 */
export const FlightState = Object.freeze({
  LANDED: 'LANDED',
  TAKING_OFF: 'TAKING_OFF',
  FLYING: 'FLYING',
  LANDING: 'LANDING',
  SPACE: 'SPACE', // en el espacio: la mueve SpaceNavigation (aquí solo compuerta, patas y puerta)
});

export class ShipFlight {
  /**
   * @param {object} p.config    sección SHIP
   * @param {object} p.ship      estado de la nave (se modifica)
   * @param {object} p.batteries BatteryBank
   * @param {object} p.terrain   { heightAt(x,z), surfaceAt(x,z) (agua incluida), isWater(x,z), bounds }
   * @param {Function} p.landingBlocked (ship) → motivo | null
   */
  constructor({ config, ship, batteries, terrain, landingBlocked = () => null }) {
    this._cfg = config;
    this.ship = ship;
    this.batteries = batteries;
    this._terrain = terrain;
    this._landingBlocked = landingBlocked;
    this.onEvent = null; // (type, data) → void

    this.state = FlightState.LANDED;
    this.forwardSpeed = 0;
    this.verticalSpeed = 0;
    this.yawRate = 0;
    this.hatchTarget = ship.hatch ?? 0;
    this.legsTarget = ship.legs ?? 1;
    this.doorTarget = ship.door ?? 0;
    this._takeoffGoal = 0;
    this._noticeCooldown = 0;
    this.autopilot = false;   // sin nadie a los mandos (lo fija ShipSystem)
    this.autoTarget = null;   // { x, z } sitio al que va a aterrizar sola
    this._forceLanding = false;
  }

  get airborne() {
    return this.state !== FlightState.LANDED;
  }

  // ---- Mandos --------------------------------------------------------------

  /** @returns {{ ok: boolean, message?: string }} */
  command(cmd) {
    const s = this.ship;
    switch (cmd) {
      case 'TAKEOFF':
        if (this.state !== FlightState.LANDED) return { ok: false, message: 'La nave ya está en el aire' };
        if (this.hatchTarget > 0 || s.hatch > 0.001) return { ok: false, message: 'Cierra la compuerta antes de despegar' };
        if (this.batteries.empty) return { ok: false, message: 'Sin batería: coloca baterías plank cargadas' };
        this.state = FlightState.TAKING_OFF;
        this._takeoffGoal = this._groundUnder().hull - DIM.BOTTOM + this._cfg.TAKEOFF_HEIGHT;
        this._takeoffGoal = Math.max(this._takeoffGoal, s.y + this._cfg.TAKEOFF_HEIGHT);
        this._emit('TAKEOFF');
        return { ok: true, message: 'Despegando…' };
      case 'LAND':
        if (this.state === FlightState.LANDED) return { ok: false, message: 'La nave ya está en tierra' };
        if (this.legsTarget < 1) return { ok: false, message: 'Saca las patas de aterrizaje para aterrizar' };
        this.state = FlightState.LANDING;
        this.autoTarget = null;
        this._emit('LANDING');
        return { ok: true, message: 'Aterrizando…' };
      case 'TOGGLE_HATCH':
        if (this.hatchTarget > 0) {
          this.hatchTarget = 0;
          return { ok: true, message: 'Cerrando compuerta' };
        }
        if (this.state === FlightState.TAKING_OFF) return { ok: false, message: 'Espera a terminar el despegue' };
        this.hatchTarget = 1;
        return { ok: true, message: this.state === FlightState.LANDED ? 'Abriendo compuerta' : 'Abriendo compuerta en el aire: ¡cuidado con la caída!' };
      case 'RETRACT_LEGS':
        if (this.state === FlightState.LANDED) return { ok: false, message: 'La nave está apoyada en las patas: despega primero' };
        if (this.legsTarget === 0) return { ok: false, message: 'Las patas ya están recogidas' };
        this.legsTarget = 0;
        return { ok: true, message: 'Recogiendo patas de aterrizaje' };
      case 'DEPLOY_LEGS':
        if (this.legsTarget === 1) return { ok: false, message: 'Las patas ya están fuera' };
        this.legsTarget = 1;
        return { ok: true, message: 'Sacando patas de aterrizaje' };
      default:
        return { ok: false, message: `Mando desconocido: ${cmd}` };
    }
  }

  toggleDoor() {
    this.doorTarget = this.doorTarget > 0 ? 0 : 1;
  }

  /** Frena en seco y se queda flotando (al levantarse el piloto en el aire). */
  hover() {
    this.forwardSpeed = this.verticalSpeed = this.yawRate = 0;
    if (this.state === FlightState.LANDING) {
      this.state = FlightState.FLYING;
      this.autoTarget = null;
    }
  }

  /**
   * Aterrizaje automático: saca las patas, busca el sitio despejado más cercano
   * (AUTOLAND_SEARCH_RADIUS), vuela hasta él y se posa. Si no encuentra ninguno y
   * no queda batería, se posa donde esté.
   */
  autoLand() {
    if (this.state === FlightState.LANDED) return false;
    this.legsTarget = 1;
    this.state = FlightState.LANDING;
    this.autoTarget = this.findLandingSpot();
    this._forceLanding = !this.autoTarget && this.batteries.empty;
    if (!this.autoTarget && !this._forceLanding) {
      this.state = FlightState.FLYING;
      this._notice('No hay un sitio despejado cerca para aterrizar', true);
      return false;
    }
    return true;
  }

  /** Sitio cercano (en anillos) donde se podría aterrizar, o null. */
  findLandingSpot(maxRadius = this._cfg.AUTOLAND_SEARCH_RADIUS) {
    const s = this.ship;
    const x0 = s.x;
    const z0 = s.z;
    let found = null;
    for (let r = 0; r <= maxRadius && !found; r += 4) {
      const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 6));
      for (let i = 0; i < n && !found; i++) {
        const a = (i / n) * Math.PI * 2;
        s.x = x0 + Math.cos(a) * r;
        s.z = z0 + Math.sin(a) * r;
        if (!this.checkLanding()) found = { x: s.x, z: s.z };
      }
    }
    s.x = x0;
    s.z = z0;
    return found;
  }

  // ---- Simulación ----------------------------------------------------------

  update(dt, controls = null) {
    const c = this._cfg;
    const s = this.ship;
    this._noticeCooldown = Math.max(0, this._noticeCooldown - dt);
    s.hatch = approach(s.hatch, this.hatchTarget, dt / c.HATCH_TIME);
    s.legs = approach(s.legs, this.legsTarget, dt / c.LEGS_TIME);
    s.door = approach(s.door, this.doorTarget, dt / c.DOOR_TIME);

    if (this.state === FlightState.LANDED) {
      this.forwardSpeed = this.verticalSpeed = this.yawRate = 0;
      s.pitch = approach(s.pitch ?? 0, 0, dt);
      s.roll = approach(s.roll ?? 0, 0, dt);
      return;
    }
    if (this.state === FlightState.SPACE) return;

    // En el aire las patas vuelven a su longitud normal.
    for (let i = 0; i < s.legFeet.length; i++) s.legFeet[i] = approach(s.legFeet[i], 0, dt * 1.5);

    const ctl = controls ?? { forward: 0, turn: 0, vertical: 0, boost: false };
    const g = this._groundUnder();
    const minY = this._minY(g);

    if (this.state === FlightState.TAKING_OFF) {
      this.forwardSpeed = approach(this.forwardSpeed, 0, c.ACCELERATION * dt);
      this.verticalSpeed = approach(this.verticalSpeed, c.TAKEOFF_SPEED, c.TAKEOFF_SPEED * 2 * dt);
      s.y += this.verticalSpeed * dt;
      if (s.y >= this._takeoffGoal) {
        this.state = FlightState.FLYING;
        this._emit('AIRBORNE');
      }
    } else if (this.state === FlightState.LANDING) {
      this.forwardSpeed = approach(this.forwardSpeed, 0, c.ACCELERATION * 1.5 * dt);
      this.yawRate = approach(this.yawRate, 0, c.TURN_RATE * 2 * dt);
      // Aterrizaje automático: primero se desplaza hasta el sitio elegido.
      let far = false;
      if (this.autoTarget) {
        const dx = this.autoTarget.x - s.x;
        const dz = this.autoTarget.z - s.z;
        const dist = Math.hypot(dx, dz);
        far = dist > 0.8;
        const step = Math.min(dist, c.AUTOLAND_SPEED * dt);
        if (dist > 1e-6) {
          s.x += (dx / dist) * step;
          s.z += (dz / dist) * step;
        }
      }
      const height = s.y - minY;
      const target = far ? Math.max(0, 2 - height) : -c.LANDING_SPEED * Math.min(1, 0.25 + height / 4);
      this.verticalSpeed = approach(this.verticalSpeed, target, c.VERTICAL_SPEED * dt);
      this._move(dt);
      if (s.y <= this._minY(this._groundUnder()) + 0.02) this._touchDown(true);
    } else {
      // FLYING: mandos del piloto.
      const max = c.MAX_SPEED * (ctl.boost ? c.BOOST_MULTIPLIER : 1);
      const targetFwd = ctl.forward > 0 ? max * ctl.forward : ctl.forward < 0 ? c.MAX_SPEED * c.REVERSE_FACTOR * ctl.forward : 0;
      const accel = targetFwd === 0 ? c.ACCELERATION * 1.3 : c.ACCELERATION * (ctl.boost ? 1.4 : 1);
      this.forwardSpeed = approach(this.forwardSpeed, targetFwd, accel * dt);
      this.yawRate = approach(this.yawRate, -ctl.turn * c.TURN_RATE, c.TURN_RATE * 3 * dt);
      this.verticalSpeed = approach(this.verticalSpeed, ctl.vertical * c.VERTICAL_SPEED, c.VERTICAL_SPEED * 2 * dt);
      this._move(dt);
      const floor = this._minY(this._groundUnder());
      if (s.y <= floor + 0.02 && ctl.vertical < 0) {
        if (s.legs >= 0.99) this._touchDown(false);
        else this._notice('Saca las patas de aterrizaje para aterrizar');
      }
    }

    if (this.state === FlightState.LANDED) return; // se acaba de posar

    // Suelo y techo de vuelo.
    const floorY = this._minY(this._groundUnder());
    if (this.state !== FlightState.LANDED && s.y < floorY) {
      s.y = floorY;
      if (this.verticalSpeed < 0) this.verticalSpeed = 0;
    }
    if (s.y > c.MAX_ALTITUDE) {
      s.y = c.MAX_ALTITUDE;
      if (this.verticalSpeed > 0) this.verticalSpeed = 0;
    }

    // Inclinación visual: morro abajo al acelerar, alabeo al girar.
    s.pitch = approach(s.pitch ?? 0, -0.1 * (this.forwardSpeed / c.MAX_SPEED), dt * 0.6);
    s.roll = approach(s.roll ?? 0, 0.22 * (this.yawRate / c.TURN_RATE), dt * 0.8);

    this._drain(dt);
  }

  _move(dt) {
    const s = this.ship;
    s.yaw += this.yawRate * dt;
    s.x += -Math.sin(s.yaw) * this.forwardSpeed * dt;
    s.z += -Math.cos(s.yaw) * this.forwardSpeed * dt;
    s.y += this.verticalSpeed * dt;
    const b = this._terrain.bounds;
    const m = 10;
    const cx = Math.min(b.maxX - m, Math.max(b.minX + m, s.x));
    const cz = Math.min(b.maxZ - m, Math.max(b.minZ + m, s.z));
    if (cx !== s.x || cz !== s.z) {
      s.x = cx;
      s.z = cz;
      this.forwardSpeed *= 0.5;
      this._notice('Límite de MUNDO 0: la nave solo puede explorar este planeta');
    }
  }

  _drain(dt) {
    const c = this._cfg;
    const B = c.BATTERIES;
    const rate = B.HOVER_DRAIN
      + B.THRUST_DRAIN * Math.min(1.6, Math.abs(this.forwardSpeed) / c.MAX_SPEED)
      + B.CLIMB_DRAIN * Math.max(0, this.verticalSpeed) / c.VERTICAL_SPEED;
    this.batteries.drain(rate * dt);
    if (this.batteries.empty && this.state !== FlightState.LANDING && this.state !== FlightState.LANDED) {
      this._emit('EMERGENCY');
      this.autoLand();
    }
  }

  /** Intenta posarse. `auto` = maniobra de aterrizaje (si falla, vuelve a planear). */
  _touchDown(auto) {
    const s = this.ship;
    const reason = this._forceLanding ? null : this.checkLanding();
    if (reason) {
      if (auto && (this.autopilot || this.batteries.empty)) {
        // Sin piloto o sin batería: busca otro sitio en lugar de quedarse flotando.
        this.autoLand();
        return false;
      }
      if (auto) {
        this.state = FlightState.FLYING;
        this.verticalSpeed = 2;
      }
      this._notice(reason, auto);
      return false;
    }
    this.autoTarget = null;
    this._forceLanding = false;
    const feet = this._feetHeights();
    s.y = Math.max(...feet);
    s.legFeet = feet.map((h) => h - s.y);
    const [rx, rz] = toWorld(s, RAMP_FOOT_SAMPLE[0], RAMP_FOOT_SAMPLE[1]);
    s.rampAngle = rampOpenAngle(this._terrain.heightAt(rx, rz) - s.y);
    s.pitch = 0;
    s.roll = 0;
    this.state = FlightState.LANDED;
    this.forwardSpeed = this.verticalSpeed = this.yawRate = 0;
    this._emit('LANDED');
    return true;
  }

  /** Motivo por el que no se puede aterrizar aquí, o null. */
  checkLanding() {
    const s = this.ship;
    for (const l of LEGS) {
      const [x, z] = toWorld(s, l.x, l.z);
      if (this._terrain.isWater(x, z)) return 'No se puede aterrizar sobre el agua';
    }
    const feet = this._feetHeights();
    if (Math.max(...feet) - Math.min(...feet) > this._cfg.LANDING_MAX_UNEVENNESS) return 'Terreno demasiado irregular para aterrizar';
    return this._landingBlocked(s);
  }

  /** Altura del terreno bajo cada pata. */
  _feetHeights() {
    const s = this.ship;
    return LEGS.map((l) => {
      const [x, z] = toWorld(s, l.x, l.z);
      return this._terrain.heightAt(x, z);
    });
  }

  /** Terreno (o agua) más alto bajo las patas y bajo toda la huella. */
  _groundUnder() {
    const s = this.ship;
    let feet = -Infinity;
    let hull = -Infinity;
    GROUND_SAMPLES.forEach(([lx, lz], i) => {
      const [x, z] = toWorld(s, lx, lz);
      const h = this._terrain.surfaceAt(x, z);
      if (i < LEGS.length) feet = Math.max(feet, h);
      hull = Math.max(hull, h);
    });
    return { feet, hull };
  }

  /** Altura mínima de la nave (plano de apoyo) sobre el terreno según las patas. */
  _minY(g) {
    const legsLow = LEG_RETRACTED_BOTTOM * (1 - this.ship.legs); // punto más bajo local
    const clearance = this.state === FlightState.LANDING ? 0 : this._cfg.GROUND_CLEARANCE * (1 - this.ship.legs);
    return Math.max(g.feet - legsLow, g.hull - DIM.BOTTOM + 0.1) + clearance;
  }

  _notice(message, force = false) {
    if (this._noticeCooldown > 0 && !force) return;
    this._noticeCooldown = 3;
    this._emit('NOTICE', { message });
  }

  _emit(type, data = {}) {
    this.onEvent?.(type, data);
  }
}

function approach(value, target, maxStep) {
  if (value < target) return Math.min(target, value + maxStep);
  if (value > target) return Math.max(target, value - maxStep);
  return value;
}
