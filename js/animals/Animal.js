/**
 * Animal — estado y comportamiento de un animal. Sin Three.js (lo dibuja
 * AnimalRenderer a partir de estos datos).
 *
 * Cada animal tiene, asignados al nacer (al azar, derivado de la seed):
 *   temperament  reacción ante la presencia del jugador
 *                FLEE    se alerta, lo mira y huye si se acerca demasiado
 *                CURIOUS se acerca a curiosear, se para cerca y lo mira
 *                NEUTRAL no reacciona: sigue pastando y paseando
 *   hitReaction  reacción al recibir un golpe
 *                FLEE    huye durante unos segundos
 *                FIGHT   persigue al jugador y le ataca durante un tiempo
 *
 * Estados: IDLE (pasta), WALK (pasea por su zona), ALERT (mira al jugador),
 *          FLEE (huye), CURIOUS (se acerca), ATTACK (persigue y ataca), DEAD.
 *
 * Evita agua, pendientes fuertes y salir del mundo, y no atraviesa árboles ni
 * rocas. Sin reproducción, necesidades ni IA avanzada.
 */
export const AnimalState = Object.freeze({
  IDLE: 'IDLE',
  WALK: 'WALK',
  ALERT: 'ALERT',
  FLEE: 'FLEE',
  CURIOUS: 'CURIOUS',
  ATTACK: 'ATTACK',
  DEAD: 'DEAD',
});

export const Temperament = Object.freeze({ FLEE: 'FLEE', CURIOUS: 'CURIOUS', NEUTRAL: 'NEUTRAL' });
export const HitReaction = Object.freeze({ FLEE: 'FLEE', FIGHT: 'FIGHT' });

const BODY_RADIUS = 0.45;
const ACCELERATION = 6;
const KNOCKBACK_DECAY = 6;

export class Animal {
  /**
   * @param {object} p
   * @param {string} p.id
   * @param {string} p.species
   * @param {object} p.def          definición de la especie (GameConfig.ANIMALS.SPECIES.*)
   * @param {object} p.home         { x, z, radius } zona del rebaño
   * @param {SeededRandom} p.rng    aleatoriedad propia (reproducible)
   * @param {string} p.temperament  Temperament.*
   * @param {string} p.hitReaction  HitReaction.*
   */
  constructor({ id, species, def, x, z, home, rng, scale, temperament, hitReaction }) {
    this.id = id;
    this.species = species;
    this.def = def;
    this.home = home;
    this.rng = rng;
    this.scale = scale;
    this.temperament = temperament;
    this.hitReaction = hitReaction;

    this.x = x;
    this.y = 0;
    this.z = z;
    this.heading = rng.range(0, Math.PI * 2); // 0 = mirando a +Z
    this.speed = 0;
    this.state = AnimalState.IDLE;
    this.timer = rng.range(0.5, 4);
    this.target = null;
    this.gaitPhase = rng.range(0, Math.PI * 2);
    this.graze = 0;       // 0..1 inclinación al pastar (visual)
    this.hitFlash = 0;    // >0 tras recibir un golpe (visual)
    this.deathProgress = 0; // 0..1 (visual)

    this.health = def.HEALTH;
    this.removed = false;
    this._kbX = 0;
    this._kbZ = 0;
    this._attackCooldown = 0;
    this._curiousCooldown = 0;
    this._hitFlee = false; // la huida actual la provocó un golpe (no el temperamento)
  }

  get alive() {
    return this.state !== AnimalState.DEAD && !this.removed;
  }

  /** Lo que da el animal al morir. */
  get drops() {
    return this.def.DROPS;
  }

  /**
   * Recibe un golpe del jugador.
   * @returns {{ killed: boolean }}
   */
  takeHit(damage, fromX, fromZ, cfg, knockback) {
    if (!this.alive) return { killed: false };
    this.health -= damage;
    this.hitFlash = 0.3;
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this._kbX = (dx / d) * knockback;
    this._kbZ = (dz / d) * knockback;

    if (this.health <= 0) {
      this.state = AnimalState.DEAD;
      this.timer = cfg.DEATH_TIME;
      this.speed = 0;
      return { killed: true };
    }
    if (this.hitReaction === HitReaction.FIGHT) {
      this.state = AnimalState.ATTACK;
      this.timer = cfg.AGGRO_TIME;
      this._attackCooldown = 0.4; // breve margen antes del primer ataque
    } else {
      this.state = AnimalState.FLEE;
      this.timer = this.rng.range(cfg.HIT_FLEE_TIME[0], cfg.HIT_FLEE_TIME[1]);
      this._hitFlee = true;
    }
    return { killed: false };
  }

  /**
   * @param {number} dt
   * @param {object} env { cfg, player:{x,z}, playerRunning, turnSpeed, isWalkable, groundAt,
   *                       resolveCollisions, onAttack(animal) }
   */
  update(dt, env) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.state === AnimalState.DEAD) {
      this.timer -= dt;
      this.deathProgress = Math.min(1, 1 - this.timer / env.cfg.DEATH_TIME);
      if (this.timer <= 0) this.removed = true;
      this._applyKnockback(dt, env);
      this.y = env.groundAt(this.x, this.z);
      return;
    }

    const d = this.def;
    const cfg = env.cfg;
    const dx = this.x - env.player.x;
    const dz = this.z - env.player.z;
    const distToPlayer = Math.hypot(dx, dz);
    const towardPlayer = Math.atan2(-dx, -dz);
    const awayFromPlayer = Math.atan2(dx, dz);
    this._attackCooldown = Math.max(0, this._attackCooldown - dt);
    this._curiousCooldown = Math.max(0, this._curiousCooldown - dt);
    this.timer -= dt;

    // ---- Reacción ante el jugador según temperamento -------------------------
    // (los estados provocados por un golpe tienen prioridad)
    const hitDriven = this.state === AnimalState.ATTACK || (this.state === AnimalState.FLEE && this._hitFlee);
    if (!hitDriven) this._reactToPlayer(distToPlayer, env);

    let desiredHeading = this.heading;
    let desiredSpeed = 0;

    switch (this.state) {
      case AnimalState.ATTACK:
        desiredHeading = towardPlayer;
        if (distToPlayer > cfg.ATTACK_RANGE * 0.85) desiredSpeed = d.FLEE_SPEED * 0.85;
        if (distToPlayer <= cfg.ATTACK_RANGE && this._attackCooldown <= 0) {
          this._attackCooldown = d.ATTACK_COOLDOWN;
          env.onAttack(this);
        }
        if (this.timer <= 0 || distToPlayer > cfg.AGGRO_MAX_DISTANCE) this._toIdle();
        break;

      case AnimalState.FLEE: {
        desiredHeading = awayFromPlayer;
        const hx = this.home.x - this.x;
        const hz = this.home.z - this.z;
        if (!this._hitFlee && Math.hypot(hx, hz) > this.home.radius * 1.8) {
          desiredHeading = blendAngle(desiredHeading, Math.atan2(hx, hz), 0.5);
        }
        desiredSpeed = d.FLEE_SPEED * (this._hitFlee ? 1.15 : 1);
        const fleeDistance = d.FLEE_DISTANCE * (env.playerRunning ? 1.6 : 1);
        if (this.timer <= 0 && (this._hitFlee || distToPlayer > fleeDistance * 1.4)) this._toIdle();
        break;
      }

      case AnimalState.CURIOUS:
        desiredHeading = towardPlayer;
        if (distToPlayer > cfg.CURIOUS_STOP_DISTANCE) desiredSpeed = d.WALK_SPEED * 1.1;
        if (this.timer <= 0 || distToPlayer > d.ALERT_DISTANCE * 2) {
          this._curiousCooldown = this.rng.range(cfg.CURIOUS_COOLDOWN[0], cfg.CURIOUS_COOLDOWN[1]);
          this._toIdle();
        }
        break;

      case AnimalState.ALERT:
        desiredHeading = towardPlayer;
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

    this._move(dt, env, desiredHeading, desiredSpeed);

    this.gaitPhase += this.speed * dt * 4.5 / this.scale;
    const grazing = this.state === AnimalState.IDLE && this.speed < 0.05 ? 1 : 0;
    this.graze += (grazing - this.graze) * Math.min(1, dt * 2.5);
  }

  // ---- Ajustes por especie (sobrescribibles) ----------------------------------

  /** Tiempo pastando antes de moverse. */
  _idleTime() {
    return this.rng.range(2, 7);
  }

  // ---- Interno -------------------------------------------------------------

  _reactToPlayer(dist, env) {
    const d = this.def;
    const s = this.state;
    switch (this.temperament) {
      case Temperament.FLEE: {
        const fleeDistance = d.FLEE_DISTANCE * (env.playerRunning ? 1.6 : 1);
        if (dist < fleeDistance) {
          if (s !== AnimalState.FLEE) this.timer = this.rng.range(2.5, 4);
          this.state = AnimalState.FLEE;
        } else if (s !== AnimalState.FLEE && dist < d.ALERT_DISTANCE) {
          this.state = AnimalState.ALERT;
        }
        break;
      }
      case Temperament.CURIOUS:
        if (s !== AnimalState.CURIOUS && this._curiousCooldown <= 0 && dist < d.ALERT_DISTANCE) {
          this.state = AnimalState.CURIOUS;
          this.timer = this.rng.range(env.cfg.CURIOUS_INTEREST_TIME[0], env.cfg.CURIOUS_INTEREST_TIME[1]);
        }
        break;
      default: // NEUTRAL: sin reacción
        break;
    }
  }

  _move(dt, env, desiredHeading, desiredSpeed) {
    const fast = this.state === AnimalState.FLEE || this.state === AnimalState.ATTACK;
    const turn = env.turnSpeed * (fast ? 2 : 1) * dt;
    this.heading += clamp(wrap(desiredHeading - this.heading), -turn, turn);
    // No avanzar a toda velocidad mientras aún se está girando mucho.
    const facing = Math.max(0, Math.cos(wrap(desiredHeading - this.heading)));
    this.speed += clamp(desiredSpeed * facing - this.speed, -ACCELERATION * dt, ACCELERATION * dt);

    if (this.speed > 0.01) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (!this._tryMoveTo(nx, nz, env)) {
        if (this.state === AnimalState.WALK) this._toIdle();
        else if (this.state === AnimalState.FLEE) this.heading += (this.rng.next() < 0.5 ? -1 : 1) * 1.2;
      }
    }
    this._applyKnockback(dt, env);
    this.y = env.groundAt(this.x, this.z);
  }

  _applyKnockback(dt, env) {
    if (Math.abs(this._kbX) + Math.abs(this._kbZ) < 0.01) return;
    this._tryMoveTo(this.x + this._kbX * dt, this.z + this._kbZ * dt, env);
    const k = Math.exp(-KNOCKBACK_DECAY * dt);
    this._kbX *= k;
    this._kbZ *= k;
  }

  _tryMoveTo(nx, nz, env) {
    if (!env.isWalkable(nx, nz)) return false;
    const pos = { x: nx, z: nz };
    env.resolveCollisions(pos, BODY_RADIUS * this.scale);
    if (!env.isWalkable(pos.x, pos.z)) return false;
    this.x = pos.x;
    this.z = pos.z;
    return true;
  }

  _toIdle() {
    this.state = AnimalState.IDLE;
    this.timer = this._idleTime();
    this.target = null;
    this._hitFlee = false;
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

/** Elige una clave según pesos { CLAVE: peso } con un valor aleatorio [0,1). */
export function pickWeighted(weights, roll) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [key, w] of entries) {
    acc += w / total;
    if (roll < acc) return key;
  }
  return entries[entries.length - 1][0];
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
