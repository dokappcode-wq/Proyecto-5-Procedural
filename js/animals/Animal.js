/**
 * Animal — estado y comportamiento de un animal. Sin Three.js (lo dibuja
 * AnimalRenderer a partir de estos datos).
 *
 * Comportamiento deliberadamente sencillo (máquina de estados):
 *   IDLE   pasta un rato (cuerpo inclinado).
 *   WALK   camina a un punto aleatorio DENTRO de su zona (la del rebaño).
 *   ALERT  el jugador está cerca: se detiene y lo mira.
 *   FLEE   el jugador está demasiado cerca: huye (más lejos si el jugador corre).
 *
 * Evita agua, pendientes fuertes y salir del mundo, y no atraviesa árboles
 * ni rocas. Sin reproducción, necesidades ni IA avanzada.
 *
 * Las subclases (Deer, Goat, Cow) definen el modelo (`static buildModel`) y
 * pueden ajustar el comportamiento sobrescribiendo los métodos `_idleTime()`
 * o `_onAlert()`.
 */
export const AnimalState = Object.freeze({ IDLE: 'IDLE', WALK: 'WALK', ALERT: 'ALERT', FLEE: 'FLEE' });

const BODY_RADIUS = 0.45;
const ACCELERATION = 6;

export class Animal {
  /**
   * @param {object} p
   * @param {string} p.id
   * @param {string} p.species
   * @param {object} p.def         definición de la especie (GameConfig.ANIMALS.SPECIES.*)
   * @param {object} p.home        { x, z, radius } zona del rebaño
   * @param {SeededRandom} p.rng   aleatoriedad propia (reproducible)
   */
  constructor({ id, species, def, x, z, home, rng, scale }) {
    this.id = id;
    this.species = species;
    this.def = def;
    this.home = home;
    this.rng = rng;
    this.scale = scale;

    this.x = x;
    this.y = 0;
    this.z = z;
    this.heading = rng.range(0, Math.PI * 2); // 0 = mirando a +Z
    this.speed = 0;
    this.state = AnimalState.IDLE;
    this.timer = rng.range(0.5, 4);
    this.target = null;
    this.gaitPhase = rng.range(0, Math.PI * 2);
    this.graze = 0; // 0..1 inclinación al pastar (visual)
    this.removed = false;
  }

  /** Lo que da el animal (Fase 7/8). */
  get drops() {
    return this.def.DROPS;
  }

  /**
   * @param {number} dt
   * @param {object} env { player:{x,z}, playerRunning, turnSpeed, isWalkable(x,z), groundAt(x,z), resolveCollisions(pos,r) }
   */
  update(dt, env) {
    const d = this.def;
    const dx = this.x - env.player.x;
    const dz = this.z - env.player.z;
    const distToPlayer = Math.hypot(dx, dz);
    const fleeDistance = d.FLEE_DISTANCE * (env.playerRunning ? 1.6 : 1);

    // ---- Transiciones -------------------------------------------------------
    if (distToPlayer < fleeDistance) {
      if (this.state !== AnimalState.FLEE) this.timer = this.rng.range(2.5, 4);
      this.state = AnimalState.FLEE;
    } else if (this.state !== AnimalState.FLEE && distToPlayer < d.ALERT_DISTANCE) {
      if (this.state !== AnimalState.ALERT) this._onAlert();
      this.state = AnimalState.ALERT;
    }

    let desiredHeading = this.heading;
    let desiredSpeed = 0;
    this.timer -= dt;

    switch (this.state) {
      case AnimalState.FLEE: {
        desiredHeading = Math.atan2(dx, dz); // alejarse del jugador
        // Sin salir demasiado de su zona: mezcla con la dirección de vuelta a casa.
        const hx = this.home.x - this.x;
        const hz = this.home.z - this.z;
        if (Math.hypot(hx, hz) > this.home.radius * 1.8) desiredHeading = blendAngle(desiredHeading, Math.atan2(hx, hz), 0.5);
        desiredSpeed = d.FLEE_SPEED;
        if (this.timer <= 0 && distToPlayer > fleeDistance * 1.4) this._toIdle();
        break;
      }
      case AnimalState.ALERT:
        desiredHeading = Math.atan2(-dx, -dz); // mirar al jugador
        if (distToPlayer > d.ALERT_DISTANCE * 1.2) this._toIdle();
        break;
      case AnimalState.WALK: {
        const tx = this.target.x - this.x;
        const tz = this.target.z - this.z;
        if (Math.hypot(tx, tz) < 0.8 || this.timer <= 0) this._toIdle();
        else {
          desiredHeading = Math.atan2(tx, tz);
          desiredSpeed = d.WALK_SPEED;
        }
        break;
      }
      default: // IDLE
        if (this.timer <= 0) this._pickWanderTarget(env);
    }

    // ---- Movimiento ---------------------------------------------------------
    const turn = env.turnSpeed * (this.state === AnimalState.FLEE ? 2 : 1) * dt;
    this.heading += clamp(wrap(desiredHeading - this.heading), -turn, turn);
    // No avanzar a toda velocidad mientras aún se está girando mucho.
    const facing = Math.max(0, Math.cos(wrap(desiredHeading - this.heading)));
    const targetSpeed = desiredSpeed * facing;
    this.speed += clamp(targetSpeed - this.speed, -ACCELERATION * dt, ACCELERATION * dt);

    if (this.speed > 0.01) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (env.isWalkable(nx, nz)) {
        const pos = { x: nx, z: nz };
        env.resolveCollisions(pos, BODY_RADIUS * this.scale);
        if (env.isWalkable(pos.x, pos.z)) {
          this.x = pos.x;
          this.z = pos.z;
        }
      } else if (this.state === AnimalState.WALK) {
        this._toIdle();
      } else {
        // Huyendo contra un obstáculo: girar hacia un lado.
        this.heading += (this.rng.next() < 0.5 ? -1 : 1) * 1.2;
      }
    }

    this.y = env.groundAt(this.x, this.z);
    this.gaitPhase += this.speed * dt * 4.5 / this.scale;
    const grazing = this.state === AnimalState.IDLE && this.speed < 0.05 ? 1 : 0;
    this.graze += (grazing - this.graze) * Math.min(1, dt * 2.5);
  }

  // ---- Ajustes por especie (sobrescribibles) ----------------------------------

  /** Tiempo pastando antes de moverse. */
  _idleTime() {
    return this.rng.range(2, 7);
  }

  _onAlert() {}

  // ---- Interno -------------------------------------------------------------

  _toIdle() {
    this.state = AnimalState.IDLE;
    this.timer = this._idleTime();
    this.target = null;
  }

  _pickWanderTarget(env) {
    for (let i = 0; i < 6; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng.next()) * this.home.radius;
      const x = this.home.x + Math.cos(a) * r;
      const z = this.home.z + Math.sin(a) * r;
      if (env.isWalkable(x, z)) {
        this.target = { x, z };
        this.state = AnimalState.WALK;
        this.timer = 20;
        return;
      }
    }
    this.timer = 1; // reintentar más tarde
  }
}

function wrap(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function blendAngle(a, b, t) {
  return a + wrap(b - a) * t;
}
